import CoreBluetooth
import Foundation

/// Step 0 spike (spec 2026-10-23-ble-remote-design.md, section 9): a throwaway Bluetooth LE link between two phones
/// to measure what the real remote will rely on. Not the product: no pairing, no security.
///
/// - Camera role: a peripheral that advertises the service, answers each `ping` with a `pong` and, when the remote opens
///   the L2CAP channel, streams 24 KB "frames" for 10 s.
/// - Remote role: a central that finds the camera, pings it every second (round trip, lost pings), reconnects by itself
///   after any drop (a pending connect plus a scan) and measures the L2CAP throughput.
/// Everything is reported as `onBleSpike` events: `{ line }` for the log and `{ stats }` for the numbers.
final class BleSpike: NSObject {
  static let shared = BleSpike()

  static let serviceUUID = CBUUID(string: "6E3F0001-8C1B-4F6E-9D4B-2A7C5E0B1A10")
  static let rxUUID = CBUUID(string: "6E3F0002-8C1B-4F6E-9D4B-2A7C5E0B1A10")
  static let txUUID = CBUUID(string: "6E3F0003-8C1B-4F6E-9D4B-2A7C5E0B1A10")
  static let psmUUID = CBUUID(string: "6E3F0004-8C1B-4F6E-9D4B-2A7C5E0B1A10")
  private static let knownKey = "repplay.blespike.camera"
  private static let frameSize = 24 * 1024
  private static let streamSeconds = 10.0

  /// Same shape as the other bridges: (event name, body).
  var emit: ((String, [String: Any]) -> Void)?

  // MARK: Camera (peripheral)

  private var peripheralManager: CBPeripheralManager?
  private var txCharacteristic: CBMutableCharacteristic?
  private var psmCharacteristic: CBMutableCharacteristic?
  private var psm: CBL2CAPPSM?
  private var subscribers: [UUID] = []
  private var queuedNotifies: [Data] = []
  private var hostChannels: [CBL2CAPChannel] = []

  // MARK: Remote (central)

  private var central: CBCentralManager?
  private var camera: CBPeripheral?
  private var rx: CBCharacteristic?
  private var remotePsm: CBL2CAPPSM?
  private var remoteChannel: CBL2CAPChannel?
  private var pingTimer: DispatchSourceTimer?
  private var seq = 0
  private var sentAt: [Int: Date] = [:]
  private var rtts: [Double] = []
  private var lost = 0
  private var drops = 0
  private var lostAt: Date?
  private var lastReconnectMs: Double?
  private var connected = false

  private func log(_ text: String) {
    let stamp = DateFormatter.localizedString(from: Date(), dateStyle: .none, timeStyle: .medium)
    emit?("onBleSpike", ["line": "\(stamp) \(text)"])
  }

  private func emitStats(extra: [String: Any] = [:]) {
    var stats: [String: Any] = ["connected": connected, "lost": lost, "drops": drops, "pings": rtts.count]
    if !rtts.isEmpty {
      stats["rttAvg"] = rtts.reduce(0, +) / Double(rtts.count)
      stats["rttMax"] = rtts.max() ?? 0
      stats["rttLast"] = rtts.last ?? 0
    }
    if let lastReconnectMs { stats["reconnectMs"] = lastReconnectMs }
    for (key, value) in extra { stats[key] = value }
    emit?("onBleSpike", ["stats": stats])
  }

  // MARK: JS API

  func startCamera() {
    DispatchQueue.main.async {
      self.stopAll()
      self.peripheralManager = CBPeripheralManager(delegate: self, queue: .main)
      self.log("câmera: ligando o Bluetooth")
    }
  }

  func startRemote() {
    DispatchQueue.main.async {
      self.stopAll()
      self.central = CBCentralManager(
        delegate: self, queue: .main, options: [CBCentralManagerOptionRestoreIdentifierKey: "repplay.blespike.central"])
      self.log("controle: ligando o Bluetooth")
    }
  }

  /// Remote only: opens the L2CAP channel; the camera then streams for 10 s.
  func measureThroughput() {
    DispatchQueue.main.async {
      guard let camera = self.camera, self.connected else { return self.log("vazão: sem conexão") }
      guard let psm = self.remotePsm else { return self.log("vazão: PSM ainda não lido") }
      self.log("vazão: abrindo canal L2CAP (PSM \(psm))")
      camera.openL2CAPChannel(psm)
    }
  }

  /// Forgets the remembered camera, so the next start finds it by scanning only.
  func forget() {
    UserDefaults.standard.removeObject(forKey: Self.knownKey)
    log("câmera lembrada esquecida")
  }

  func stop() { DispatchQueue.main.async { self.stopAll() } }

  private func stopAll() {
    if let pm = peripheralManager {
      pm.stopAdvertising()
      pm.removeAllServices()
      if let psm { pm.unpublishL2CAPChannel(psm) }
    }
    peripheralManager = nil
    txCharacteristic = nil
    psmCharacteristic = nil
    psm = nil
    subscribers.removeAll()
    queuedNotifies.removeAll()
    hostChannels.removeAll()

    pingTimer?.cancel()
    pingTimer = nil
    if let central {
      central.stopScan()
      if let camera { central.cancelPeripheralConnection(camera) }
    }
    central = nil
    camera = nil
    rx = nil
    remotePsm = nil
    remoteChannel = nil
    sentAt.removeAll()
    rtts.removeAll()
    lost = 0
    drops = 0
    lostAt = nil
    lastReconnectMs = nil
    connected = false
  }

  // MARK: Remote helpers

  /// After a drop or at start: a pending connect to the remembered camera (never times out) plus a scan.
  private func lookForCamera() {
    guard let central, central.state == .poweredOn else { return }
    if let camera {
      central.connect(camera, options: nil)
      log("controle: pedido de conexão pendente para a câmera conhecida")
    } else if let raw = UserDefaults.standard.string(forKey: Self.knownKey), let id = UUID(uuidString: raw),
              let known = central.retrievePeripherals(withIdentifiers: [id]).first {
      camera = known
      known.delegate = self
      central.connect(known, options: nil)
      log("controle: pedido de conexão pendente para a câmera lembrada")
    }
    central.scanForPeripherals(withServices: [Self.serviceUUID], options: nil)
  }

  private func startPinging() {
    pingTimer?.cancel()
    let timer = DispatchSource.makeTimerSource(queue: .main)
    timer.schedule(deadline: .now() + 1, repeating: 1)
    timer.setEventHandler { [weak self] in self?.ping() }
    timer.resume()
    pingTimer = timer
  }

  private func ping() {
    let now = Date()
    for (number, at) in sentAt where now.timeIntervalSince(at) > 3 {
      sentAt.removeValue(forKey: number)
      lost += 1
    }
    guard connected, let camera, let rx else { return emitStats() }
    seq += 1
    sentAt[seq] = now
    camera.writeValue(Data("ping:\(seq)".utf8), for: rx, type: .withResponse)
    emitStats()
  }

  private func readStream(_ channel: CBL2CAPChannel) {
    guard let input = channel.inputStream else { return log("vazão: canal sem stream de entrada") }
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      input.open()
      var buffer = [UInt8](repeating: 0, count: 64 * 1024)
      var total = 0
      var window = 0
      let start = Date()
      var tick = Date()
      while true {
        let n = input.read(&buffer, maxLength: buffer.count)
        if n <= 0 { break }
        total += n
        window += n
        let now = Date()
        if now.timeIntervalSince(tick) >= 1 {
          let kbs = Double(window) / 1024 / now.timeIntervalSince(tick)
          DispatchQueue.main.async { self?.emitStats(extra: ["kbps": kbs]) }
          window = 0
          tick = now
        }
      }
      input.close()
      let seconds = max(Date().timeIntervalSince(start), 0.001)
      let avg = Double(total) / 1024 / seconds
      DispatchQueue.main.async {
        self?.log(String(format: "vazão: %.0f KB em %.1f s = %.0f KB/s em média", Double(total) / 1024, seconds, avg))
        self?.emitStats(extra: ["kbpsAvg": avg])
        self?.remoteChannel = nil
      }
    }
  }

  // MARK: Camera helpers

  private func notify(_ data: Data) {
    guard let pm = peripheralManager, let tx = txCharacteristic else { return }
    if !pm.updateValue(data, for: tx, onSubscribedCentrals: nil) { queuedNotifies.append(data) }
  }

  private func stream(_ channel: CBL2CAPChannel) {
    guard let output = channel.outputStream else { return log("vazão: canal sem stream de saída") }
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      output.open()
      let frame = [UInt8](repeating: 0xAB, count: Self.frameSize)
      let start = Date()
      var total = 0
      outer: while Date().timeIntervalSince(start) < Self.streamSeconds {
        var offset = 0
        while offset < frame.count {
          let n = frame[offset...].withUnsafeBufferPointer { output.write($0.baseAddress!, maxLength: $0.count) }
          if n <= 0 { break outer }
          offset += n
          total += n
        }
      }
      output.close()
      let seconds = Date().timeIntervalSince(start)
      DispatchQueue.main.async {
        self?.log(String(format: "câmera: enviou %.0f KB em %.1f s", Double(total) / 1024, seconds))
        self?.hostChannels.removeAll { $0 === channel }
      }
    }
  }
}

// MARK: - Peripheral (camera)

extension BleSpike: CBPeripheralManagerDelegate {
  func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
    log("câmera: Bluetooth \(Self.describe(peripheral.state))")
    guard peripheral.state == .poweredOn, txCharacteristic == nil else { return }
    let rx = CBMutableCharacteristic(type: Self.rxUUID, properties: [.write], value: nil, permissions: [.writeable])
    let tx = CBMutableCharacteristic(type: Self.txUUID, properties: [.notify], value: nil, permissions: [.readable])
    let psmChar = CBMutableCharacteristic(type: Self.psmUUID, properties: [.read], value: nil, permissions: [.readable])
    let service = CBMutableService(type: Self.serviceUUID, primary: true)
    service.characteristics = [rx, tx, psmChar]
    txCharacteristic = tx
    psmCharacteristic = psmChar
    peripheral.add(service)
    peripheral.publishL2CAPChannel(withEncryption: false)
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
    if let error { return log("câmera: erro ao criar o serviço: \(error.localizedDescription)") }
    peripheral.startAdvertising([CBAdvertisementDataServiceUUIDsKey: [Self.serviceUUID]])
  }

  func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
    if let error { return log("câmera: erro ao anunciar: \(error.localizedDescription)") }
    log("câmera: anunciando, esperando o controle")
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didPublishL2CAPChannel PSM: CBL2CAPPSM, error: Error?) {
    if let error { return log("câmera: erro no L2CAP: \(error.localizedDescription)") }
    psm = PSM
    log("câmera: canal L2CAP publicado (PSM \(PSM))")
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didSubscribeTo characteristic: CBCharacteristic) {
    if !subscribers.contains(central.identifier) { subscribers.append(central.identifier) }
    log("câmera: controle conectado (\(subscribers.count) no total)")
    emit?("onBleSpike", ["stats": ["connected": true, "controllers": subscribers.count]])
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didUnsubscribeFrom characteristic: CBCharacteristic) {
    subscribers.removeAll { $0 == central.identifier }
    log("câmera: controle desconectado (\(subscribers.count) restantes)")
    emit?("onBleSpike", ["stats": ["connected": !subscribers.isEmpty, "controllers": subscribers.count]])
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
    guard request.characteristic.uuid == Self.psmUUID, let psm else {
      return peripheral.respond(to: request, withResult: .attributeNotFound)
    }
    var value = psm.littleEndian
    let data = Data(bytes: &value, count: MemoryLayout<CBL2CAPPSM>.size)
    guard request.offset <= data.count else { return peripheral.respond(to: request, withResult: .invalidOffset) }
    request.value = data.subdata(in: request.offset..<data.count)
    peripheral.respond(to: request, withResult: .success)
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
    for request in requests {
      guard let value = request.value, let text = String(data: value, encoding: .utf8), text.hasPrefix("ping:") else { continue }
      notify(Data(("pong:" + text.dropFirst(5)).utf8))
    }
    if let first = requests.first { peripheral.respond(to: first, withResult: .success) }
  }

  func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
    guard let tx = txCharacteristic else { return }
    while let next = queuedNotifies.first {
      if !peripheral.updateValue(next, for: tx, onSubscribedCentrals: nil) { return }
      queuedNotifies.removeFirst()
    }
  }

  func peripheralManager(_ peripheral: CBPeripheralManager, didOpen channel: CBL2CAPChannel?, error: Error?) {
    if let error { return log("câmera: erro ao abrir L2CAP: \(error.localizedDescription)") }
    guard let channel else { return }
    hostChannels.append(channel)
    log("câmera: canal L2CAP aberto, enviando por \(Int(Self.streamSeconds)) s")
    stream(channel)
  }
}

// MARK: - Central (remote)

extension BleSpike: CBCentralManagerDelegate, CBPeripheralDelegate {
  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    log("controle: Bluetooth \(Self.describe(central.state))")
    if central.state == .poweredOn { lookForCamera() }
  }

  func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
    if let restored = (dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral])?.first {
      camera = restored
      restored.delegate = self
      log("controle: conexão restaurada pelo sistema")
    }
  }

  func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                      advertisementData: [String: Any], rssi RSSI: NSNumber) {
    if connected { return }
    if let camera, camera.identifier == peripheral.identifier { return }  // its pending connect will finish
    log("controle: câmera encontrada pela busca (sinal \(RSSI) dBm)")
    if let old = camera { central.cancelPeripheralConnection(old) }
    camera = peripheral
    peripheral.delegate = self
    central.connect(peripheral, options: nil)
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    central.stopScan()
    camera = peripheral
    peripheral.delegate = self
    UserDefaults.standard.set(peripheral.identifier.uuidString, forKey: Self.knownKey)
    if let lostAt {
      lastReconnectMs = Date().timeIntervalSince(lostAt) * 1000
      log(String(format: "controle: RECONECTADO após %.1f s", lastReconnectMs! / 1000))
      self.lostAt = nil
    } else {
      log("controle: conectado")
    }
    peripheral.discoverServices([Self.serviceUUID])
  }

  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    log("controle: falha ao conectar (\(error.map { $0.localizedDescription } ?? "sem detalhe")), tentando de novo")
    lookForCamera()
  }

  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    connected = false
    rx = nil
    remotePsm = nil
    drops += 1
    lostAt = Date()
    log("controle: CAIU (\(error.map { $0.localizedDescription } ?? "sem erro")), reconectando")
    emitStats()
    lookForCamera()
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    guard let service = peripheral.services?.first(where: { $0.uuid == Self.serviceUUID }) else {
      return log("controle: serviço não encontrado")
    }
    peripheral.discoverCharacteristics([Self.rxUUID, Self.txUUID, Self.psmUUID], for: service)
  }

  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    for characteristic in service.characteristics ?? [] {
      switch characteristic.uuid {
      case Self.rxUUID: rx = characteristic
      case Self.txUUID: peripheral.setNotifyValue(true, for: characteristic)
      case Self.psmUUID: peripheral.readValue(for: characteristic)
      default: break
      }
    }
    connected = rx != nil
    log("controle: pronto (MTU de escrita \(peripheral.maximumWriteValueLength(for: .withResponse)) bytes)")
    startPinging()
    emitStats()
  }

  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    guard let value = characteristic.value else { return }
    if characteristic.uuid == Self.psmUUID {
      guard value.count >= 2 else { return }
      remotePsm = CBL2CAPPSM(value[value.startIndex]) | (CBL2CAPPSM(value[value.startIndex + 1]) << 8)
      return
    }
    guard characteristic.uuid == Self.txUUID, let text = String(data: value, encoding: .utf8), text.hasPrefix("pong:"),
          let number = Int(text.dropFirst(5)), let at = sentAt.removeValue(forKey: number) else { return }
    rtts.append(Date().timeIntervalSince(at) * 1000)
    if rtts.count > 600 { rtts.removeFirst(rtts.count - 600) }
  }

  func peripheral(_ peripheral: CBPeripheral, didOpen channel: CBL2CAPChannel?, error: Error?) {
    if let error { return log("vazão: erro ao abrir: \(error.localizedDescription)") }
    guard let channel else { return }
    remoteChannel = channel
    log("vazão: canal aberto, medindo")
    readStream(channel)
  }

  private static func describe(_ state: CBManagerState) -> String {
    switch state {
    case .poweredOn: return "ligado"
    case .poweredOff: return "DESLIGADO"
    case .unauthorized: return "SEM PERMISSÃO"
    case .unsupported: return "não suportado"
    case .resetting: return "reiniciando"
    default: return "desconhecido"
    }
  }
}

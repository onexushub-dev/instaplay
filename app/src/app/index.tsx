import { Redirect } from 'expo-router';

import { repo } from '../data/mmkv';

export default function Index() {
  return <Redirect href={repo.getPrefs().onboardingDone ? '/setup' : '/onboarding'} />;
}

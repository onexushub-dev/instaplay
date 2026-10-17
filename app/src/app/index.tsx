import { Redirect } from 'expo-router';

// Temporary entry: Task 6 routes between onboarding and setup from the stored prefs.
export default function Index() {
  return <Redirect href="/onboarding" />;
}

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.receiptvault.app',
  appName: 'Receipt Vault',
  webDir: 'dist',
  // The app is fully local: no remote server is ever contacted.
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor'
  },
  ios: {
    contentInset: 'automatic'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#0f172a'
    }
  }
};

export default config;

const { expo } = require('./app.json');

// EAS file environment variable: Firebase client configuration for Android push.
// Server-side FCM credentials are managed separately in the Expo dashboard.
module.exports = {
  ...expo,
  android: {
    ...expo.android,
    ...(process.env.GOOGLE_SERVICES_JSON
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
      : {}),
  },
};

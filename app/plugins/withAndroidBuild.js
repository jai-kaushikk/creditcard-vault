// Android build settings that CNG regenerates on every prebuild:
// - Release signing: your own keystore when CV_KEYSTORE_FILE is set (CI sets it
//   from repository secrets). Otherwise the standard React Native debug
//   keystore, whose SHA-1 is public and stable: fine for testing, never for
//   the Play Store.
// - More Gradle heap, so R8 minification fits on CI runners.
const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const RELEASE_CONFIG = `
        release {
            if (System.getenv('CV_KEYSTORE_FILE')) {
                storeFile file(System.getenv('CV_KEYSTORE_FILE'))
                storePassword System.getenv('CV_KEYSTORE_PASSWORD')
                keyAlias System.getenv('CV_KEY_ALIAS')
                keyPassword System.getenv('CV_KEY_PASSWORD')
            }
        }`;

function withHeap(config) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === 'org.gradle.jvmargs'));
    cfg.modResults.push({ type: 'property', key: 'org.gradle.jvmargs', value: '-Xmx4g -XX:MaxMetaspaceSize=1g' });
    return cfg;
  });
}

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes("System.getenv('CV_KEYSTORE_FILE')")) return cfg;
    src = src.replace(/signingConfigs \{\n(\s+debug \{[\s\S]*?\n\s+\})/, (m) => `${m}${RELEASE_CONFIG}`);
    src = src.replace(
      /(release \{\n(?:\s*\/\/.*\n)*\s+)signingConfig signingConfigs\.debug/,
      "$1signingConfig System.getenv('CV_KEYSTORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = (config) => withHeap(withReleaseSigning(config));

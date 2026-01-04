const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/dist/metro");

const config = getDefaultConfig(__dirname);

// Setup WASM for expo-sqlite (must be an asset, not source)
config.resolver.assetExts.push('wasm');
config.resolver.sourceExts = config.resolver.sourceExts.filter(ext => ext !== 'wasm');

// Exclude WASM files from transformation
config.transformer = {
    ...config.transformer,
    getTransformOptions: async () => ({
        transform: {
            experimentalImportSupport: false,
            inlineRequires: true,
        },
    }),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (platform === 'web') {
        if (moduleName === 'react-native-worklets') {
            return {
                filePath: require.resolve('./mocks/react-native-worklets.js'),
                type: 'sourceFile',
            };
        }
    }
    // Chain to standard Metro resolver
    return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });

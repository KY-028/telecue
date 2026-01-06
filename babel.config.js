module.exports = function (api) {
    api.cache(true);
    return {
        presets: [
            [
                "babel-preset-expo",
                {
                    jsxImportSource: "nativewind",
                    worklets: false, // 👈 THIS IS THE FIX
                },
            ],
            "nativewind/babel",
        ],
        plugins: [
            "react-native-reanimated/plugin",
            "react-native-worklets-core/plugin",
        ],
    };
};
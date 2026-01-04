
// Mock for react-native-worklets on Web

export const RuntimeKind = {
    ReactNative: 'ReactNative',
    Web: 'Web',
};

// Serializable
export const createSerializable = (obj) => obj;
export const isSerializableRef = () => false;
export const serializableMappingCache = new Map();

// Worklets
export const isWorkletFunction = () => false;
export const runOnUI = (fn) => fn; // Run immediately on web
export const runOnJS = (fn) => fn; // Run immediately on web
export const runOnUIAsync = (fn) => setTimeout(fn, 0);

// Shareables
export const makeShareable = (obj) => obj;
export const isShareableRef = () => false;
export const shareableMappingCache = new Map();
export const makeShareableCloneOnUIRecursive = (obj) => obj;
export const makeShareableCloneRecursive = (obj) => obj;

// Runtimes
export const createWorkletRuntime = () => ({});
export const runOnRuntime = (runtime, fn) => fn();

// Module
export const WorkletsModule = {
    makeShareableClone: (obj) => obj,
};

export const Worklets = {
    createWorklet: () => { },
    createRunOnJS: () => { },
};

export default {
    RuntimeKind,
    createSerializable,
    isSerializableRef,
    serializableMappingCache,
    isWorkletFunction,
    runOnUI,
    runOnJS,
    runOnUIAsync,
    makeShareable,
    isShareableRef,
    shareableMappingCache,
    makeShareableCloneOnUIRecursive,
    makeShareableCloneRecursive,
    createWorkletRuntime,
    runOnRuntime,
    WorkletsModule,
    Worklets
};

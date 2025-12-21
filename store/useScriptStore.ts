import { create } from 'zustand';

export interface Script {
    id?: number;
    title: string;
    content: string;
    font_family: string;
    font_size: number;
    margin: number;
    speed: number;
    is_mirrored_h: boolean;
    is_mirrored_v: boolean;
    mode: 'phone' | 'rig';
    last_modified?: string;
}

interface ScriptState {
    activeScript: Script | null;
    recentScripts: Script[];
    setActiveScript: (script: Script | null) => void;
    setRecentScripts: (scripts: Script[]) => void;
    updateActiveScriptSettings: (settings: Partial<Script>) => void;
    resetActiveScript: () => void;
}

export const useScriptStore = create<ScriptState>((set) => ({
    activeScript: null,
    recentScripts: [],
    setActiveScript: (script) => set({ activeScript: script }),
    setRecentScripts: (scripts) => set({ recentScripts: scripts }),
    resetActiveScript: () => set({
        activeScript: {
            title: '',
            content: '',
            font_family: 'System',
            font_size: 3,
            margin: 20,
            speed: 3,
            is_mirrored_h: false,
            is_mirrored_v: false,
            mode: 'phone',
        }
    }),
    updateActiveScriptSettings: (settings) => set((state) => ({
        activeScript: state.activeScript ? { ...state.activeScript, ...settings } : null
    })),
}));

/**
 * Color manipulation utilities for comparing perceptual color differences.
 */

interface RGB { r: number; g: number; b: number; }
interface LAB { l: number; a: number; b: number; }

export const DEFINED_COLORS = [
    '#FFFFFF', '#000000', '#EF4444', '#3B82F6', '#22C55E', '#EAB308'
];

function parseColorToRgb(colorStr: string): RGB | null {
    // Try Hex
    if (colorStr.startsWith('#')) {
        const hex = normalizeHex(colorStr);
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }
    // Try RGB/RGBA
    const rgbMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
        return {
            r: parseInt(rgbMatch[1], 10),
            g: parseInt(rgbMatch[2], 10),
            b: parseInt(rgbMatch[3], 10)
        };
    }
    return null;
}

// Convert RGB to XYZ then to LAB
function rgbToLab(rgb: RGB): LAB {
    let r = rgb.r / 255;
    let g = rgb.g / 255;
    let b = rgb.b / 255;

    r = (r > 0.04045) ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = (g > 0.04045) ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = (b > 0.04045) ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

    let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) * 100;
    let y = (r * 0.2126 + g * 0.7152 + b * 0.0722) * 100;
    let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) * 100;

    x = x / 95.047;
    y = y / 100.000;
    z = z / 108.883;

    x = (x > 0.008856) ? Math.pow(x, 1 / 3) : (7.787 * x) + (16 / 116);
    y = (y > 0.008856) ? Math.pow(y, 1 / 3) : (7.787 * y) + (16 / 116);
    z = (z > 0.008856) ? Math.pow(z, 1 / 3) : (7.787 * z) + (16 / 116);

    return {
        l: (116 * y) - 16,
        a: 500 * (x - y),
        b: 200 * (y - z)
    };
}

// CIE76 Delta E
function deltaE(lab1: LAB, lab2: LAB): number {
    return Math.sqrt(
        Math.pow(lab1.l - lab2.l, 2) +
        Math.pow(lab1.a - lab2.a, 2) +
        Math.pow(lab1.b - lab2.b, 2)
    );
}

export function shouldResetToDefaultColor(colorStr: string): boolean {
    const rgb = parseColorToRgb(colorStr);
    if (!rgb) return false;

    // 1. Check if it's one of the defined colors
    // We convert the parsed RGB back to Hex to ensure consistent comparison
    const currentHex = "#" + ((1 << 24) + (rgb.r << 16) + (rgb.g << 8) + rgb.b).toString(16).slice(1).toUpperCase();

    // Also check the raw input if it was already a valid normalized hex
    if (DEFINED_COLORS.includes(currentHex) || (colorStr.startsWith('#') && DEFINED_COLORS.includes(normalizeHex(colorStr)))) {
        return false;
    }

    // 2. Calculate DeltaE with Black (#000000) AND White (#FFFFFF)
    const labCurrent = rgbToLab(rgb);
    const labBlack = rgbToLab({ r: 0, g: 0, b: 0 });
    const labWhite = rgbToLab({ r: 255, g: 255, b: 255 });

    const diffBlack = deltaE(labCurrent, labBlack);
    const diffWhite = deltaE(labCurrent, labWhite);

    // 3. If score < 50 with EITHER, reset to default (strip color)
    return diffBlack < 50 || diffWhite < 50;
}

// Helper to expand short hex #FFF -> #FFFFFF
export function normalizeHex(hex: string): string {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
        return '#' + hex.split('').map(c => c + c).join('').toUpperCase();
    }
    return '#' + hex.toUpperCase();
}

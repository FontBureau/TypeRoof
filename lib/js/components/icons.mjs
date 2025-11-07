import { HTMLString } from "../domTool.mjs";

export function createIcon(name) {
    return new HTMLString(`<span class="material-symbols-outlined">${name}</span>`);
}

export function createIconAndLabel(iconName, label) {
    return new HTMLString(`${createIcon(iconName)} ${label}`);
}

export function createLabelAndIcon(label, iconName) {
    return new HTMLString(`${label} ${createIcon(iconName)}`);
}

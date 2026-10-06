// utils/phone.ts

export function normalizePhone(input: string | null | undefined): string | null {
    if (!input) return null;

    let cleaned = String(input).replace(/[^\d+]/g, '');
    if (!cleaned) return null;

    const hasPlus = cleaned.startsWith('+');
    cleaned = cleaned.replace(/\+/g, '');
    if (hasPlus) cleaned = '+' + cleaned;

    if (cleaned.startsWith('+62')) return cleaned;
    if (cleaned.startsWith('62')) return '+' + cleaned;
    if (cleaned.startsWith('0')) return '+62' + cleaned.slice(1);
    if (cleaned.startsWith('8')) return '+62' + cleaned;
    if (/^\d+$/.test(cleaned)) return '+62' + cleaned;

    return null;
}

export function formatPhoneDisplay(input: string | null | undefined): string {
    const normalized = normalizePhone(input);
    if (!normalized) return input ?? '-';

    const match = normalized.match(/^\+62(\d+)$/);
    if (!match) return normalized;

    const digits = match[1];
    if (digits.length >= 9) {
        const p1 = digits.slice(0, 3);
        const p2 = digits.slice(3, 7);
        const p3 = digits.slice(7);
        return `+62 ${p1}-${p2}-${p3}`;
    }
    return normalized;
}

export function isValidPhone(input: string | null | undefined): boolean {
    return normalizePhone(input) !== null;
}
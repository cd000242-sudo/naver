export function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function normalizePhone(value: string): string {
    return value.replace(/[^\d]/g, '');
}

export function isValidPhone(value: string): boolean {
    const digits = normalizePhone(value);
    return /^01[016789]\d{7,8}$/.test(digits);
}

export function maskEmail(value: string): string {
    const email = value.trim();
    const [local, domain = ''] = email.split('@');
    if (!local || !domain) return email;
    const visibleLocal = local.slice(0, Math.min(2, local.length));
    return `${visibleLocal}${'*'.repeat(Math.max(3, local.length - visibleLocal.length))}@***`;
}

export function maskPhone(value: string): string {
    const digits = normalizePhone(value);
    if (digits.length < 7) return value;
    return `${digits.slice(0, 3)}-****-****`;
}

export function maskContactText(value: string): string {
    return value
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => maskEmail(email))
        .replace(/(?:\+82[-.\s]?)?0?1[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g, (phone) => maskPhone(phone));
}

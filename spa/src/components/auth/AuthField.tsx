import type { InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    hint?: string;
};

/** Label + input (+ one short hint line), sized for easy tapping. */
function AuthField({ label, hint, ...input }: Props) {
    return (
        <label className="lp-field">
            <span>{label}</span>
            <input className="lp-input" {...input} />
            {hint ? <small>{hint}</small> : null}
        </label>
    );
}

export default AuthField;

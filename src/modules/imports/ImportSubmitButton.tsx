"use client";

import { useFormStatus } from "react-dom";

export function ImportSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <div className="import-submit-control">
      <button className="primary-action" type="submit" disabled={pending}>
        {pending ? "Importing" : "Run import"}
      </button>
      <div className="upload-progress" aria-live="polite">
        <progress hidden={!pending} />
        <span hidden={!pending}>Import in progress</span>
      </div>
    </div>
  );
}

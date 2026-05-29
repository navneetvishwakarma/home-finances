"use client";

import { useMemo, useState } from "react";

export function AccountNameInput({
  activeAccountNames,
  defaultValue = "Primary account"
}: {
  activeAccountNames: string[];
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const trimmedValue = value.trim();
  const matchingAccount = useMemo(
    () =>
      activeAccountNames.find(
        (accountName) =>
          trimmedValue.length > 0 &&
          accountName.toLocaleLowerCase() === trimmedValue.toLocaleLowerCase() &&
          accountName !== trimmedValue
      ),
    [activeAccountNames, trimmedValue]
  );

  return (
    <>
      <input
        name="accountDisplayName"
        value={value}
        list="account-name-suggestions"
        onChange={(event) => setValue(event.target.value)}
        required
      />
      <datalist id="account-name-suggestions">
        {activeAccountNames.map((accountName) => (
          <option key={accountName} value={accountName} />
        ))}
      </datalist>
      {matchingAccount ? (
        <p className="duplicate-account-warning">An account named {matchingAccount} already exists. Using it.</p>
      ) : null}
    </>
  );
}

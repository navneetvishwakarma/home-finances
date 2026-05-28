UPDATE "transactions"
SET
  "category" = CASE
    WHEN upper("description") ~ '\m(ZERODHA|INDIAN[[:space:]]+CLEARING[[:space:]]+CORP(ORATION)?|BROKING)\M' OR upper("description") LIKE '%SIPG%' THEN 'savings_investments'
    WHEN upper("description") ~ '\mEMI\M|HOME[[:space:]]+LOAN|CAR[[:space:]]+LOAN|BIKE[[:space:]]+LOAN|PERSONAL[[:space:]]+LOAN' THEN 'emis'
    WHEN upper("description") ~ '\m(INTDIV|DIVIDEND)\M' THEN 'income'
    ELSE "category"
  END,
  "category_source" = CASE
    WHEN upper("description") ~ '\m(ZERODHA|INDIAN[[:space:]]+CLEARING[[:space:]]+CORP(ORATION)?|BROKING)\M' OR upper("description") LIKE '%SIPG%' THEN 'system_rule'
    WHEN upper("description") ~ '\mEMI\M|HOME[[:space:]]+LOAN|CAR[[:space:]]+LOAN|BIKE[[:space:]]+LOAN|PERSONAL[[:space:]]+LOAN' THEN 'system_rule'
    WHEN upper("description") ~ '\m(INTDIV|DIVIDEND)\M' THEN 'system_rule'
    ELSE "category_source"
  END
WHERE "category_source" <> 'manual';

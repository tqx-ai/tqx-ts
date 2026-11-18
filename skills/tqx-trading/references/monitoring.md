# Trading monitoring and recovery

When ongoing tracking is requested or a portfolio is first created, remind the user to set up a scheduled or automated task. Make the frequency, monitoring period, market, commands, alert channels, and stop conditions explicit. Schedules are read-only by default; automatic order placement is allowed only when explicitly covered by the continuing authorization. Each scheduled run must rerun `tqx status --json`, account, position, open-order, fill, and related signal queries, and record the timestamp and `is_stale` value.
If the user actively exits or restarts the agent, the user is prompted to resume the task using words similar to the following:

> Please retrieve your memory and this Skill and continue to help me monitor my positions and transactions. First run `tqx status --json` to confirm the authentication and account mode.
> Check accounts, positions, outstanding orders, transactions and signals again; confirm whether the previous continuous agent authorization is still valid, and only automatically trade within the authorized scope. If it exceeds the scope, ask first.

After recovery, do not rely on remembered balance, positions, or order status; re-query the current state. Automatic trading may resume only under an unexpired continuing authorization explicitly granted by the user; vague historical memory cannot restore authorization. If local credentials are invalid and the user has provided a new key, repeat the login; otherwise ask for the key without echoing it.

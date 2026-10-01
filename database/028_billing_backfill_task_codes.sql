-- Fill Task Code on bills pushed before the task_code column existed (or
-- while inserts were being stripped), by reading the code back from the
-- matter description ("... bearing Task Code W2627-09-138"). Safe to re-run.
update public.firm_billing_records
set task_code = substring(description from 'bearing Task Code (W[A-Za-z0-9/-]+)')
where (task_code is null or task_code = '')
  and description like '%bearing Task Code W%';

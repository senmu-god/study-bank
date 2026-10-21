-- Removes only the publisher RPC. Already published questions and draft history remain.
drop function if exists public.kp_publish_question_draft(uuid);

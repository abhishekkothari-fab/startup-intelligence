-- Enable Realtime on profiling_jobs so clients can subscribe to pass-level updates
-- instead of polling the get-job endpoint.
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiling_jobs;

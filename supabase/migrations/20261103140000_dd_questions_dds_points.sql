-- The course isn't DDS-certified: questions no longer say it removes points or earns the
-- statutory discount. Point reduction is taught as DDS-course-only; discounts as the insurer's call.
UPDATE public.dd_questions SET
  prompt = 'Point reduction on a Georgia license (up to 7 points, once every 5 years) is available only through:',
  choices = '[{"key":"a","text":"A DDS-certified defensive driving course"},{"key":"b","text":"Any online driving course"},{"key":"c","text":"Paying the ticket early"},{"key":"d","text":"A request to your insurance company"}]'::jsonb,
  correct_key = 'a'
WHERE id = 'd7c9a5a7-ff02-420f-8607-b6f5eff40d80';

UPDATE public.dd_questions SET
  prompt = 'Who decides whether completing this course earns you an insurance discount?',
  choices = '[{"key":"a","text":"Georgia DDS"},{"key":"b","text":"Your insurance company"},{"key":"c","text":"The course provider"},{"key":"d","text":"A traffic court judge"}]'::jsonb,
  correct_key = 'b', objective_tag = 'discount-eligibility'
WHERE id = 'd9fe8fe1-78be-4c37-884d-88ba34287f85';

UPDATE public.dd_questions SET
  prompt = 'Insurers commonly look for a clean recent driving record, with no at-fault claims, when deciding safe-driver discounts.'
WHERE id = '991527c4-3ac6-4820-be39-723991937923';

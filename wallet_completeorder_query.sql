select
  id,
  lower(coalesce(data->>'status','')) as status,
  lower(coalesce(data->>'paymentMethod','jspay')) as payment_method,
  lower(coalesce(data->>'adminReviewStatus','')) as admin_review_status,
  coalesce((data->>'pendingAdminReview')::boolean, false) as pending_admin_review,
  coalesce((data->>'walletSettled')::boolean, false) as wallet_settled,
  coalesce(nullif(data->>'paidAmount',''),'0')::bigint as paid_amount,
  data->>'talentId' as talent_id,
  data->>'sellerId' as seller_id
from orders
where lower(coalesce(data->>'paymentMethod','jspay')) <> 'cod'
  and lower(coalesce(data->>'status','')) in ('completed','rated')
  and lower(coalesce(data->>'adminReviewStatus','')) = 'approved'
  and coalesce((data->>'pendingAdminReview')::boolean, false) = false
  and coalesce((data->>'walletSettled')::boolean, false) = false
  and coalesce(nullif(data->>'paidAmount',''),'0')::bigint > 0
order by coalesce(nullif(data->>'createdAt',''),'0')::bigint desc
limit 5;
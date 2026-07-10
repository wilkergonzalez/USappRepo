insert into public.bills (source, source_bill_id, title, summary, state_scope, status, sponsor, pros, cons, approve_count, disapprove_count, total_votes)
values
  (
    'demo',
    'hb-101',
    'Utah Classroom Technology Modernization Act',
    'Expands grants for device replacement, classroom connectivity, and teacher training in Utah public schools.',
    'UT',
    'introduced',
    'Rep. Morgan Reed',
    array['Better connectivity for rural schools', 'Modern devices for instruction', 'Training funds for teachers'],
    array['Ongoing maintenance costs', 'Districts must manage rollout', 'May favor already-resourced schools'],
    1842,
    611,
    2453
  ),
  (
    'demo',
    'hb-204',
    'Clean Transit Corridor Grant Program',
    'Creates pilot grants for low-emission transit routes connecting Utah population centers and commuter corridors.',
    'UT',
    'committee_review',
    'Sen. Elena Vasquez',
    array['Potential emissions reduction', 'Improved commuter access', 'Pilot funding is limited'],
    array['Requires matching funds', 'Could shift money from road maintenance', 'Long payback horizon'],
    1022,
    744,
    1766
  ),
  (
    'demo',
    'hb-309',
    'Family Care Affordability Tax Credit',
    'Offers a refundable tax credit for families with dependents who incur qualified care expenses in Utah.',
    'UT',
    'floor_calendar',
    'Rep. Aiden Holt',
    array['Direct relief to working families', 'Refundable credit reaches lower-income households', 'Clear administrative path'],
    array['Budget impact', 'Eligibility complexity', 'May not fully cover childcare gaps'],
    2115,
    890,
    3005
  )
on conflict (source, source_bill_id) do update set
  title = excluded.title,
  summary = excluded.summary,
  state_scope = excluded.state_scope,
  status = excluded.status,
  sponsor = excluded.sponsor,
  pros = excluded.pros,
  cons = excluded.cons,
  approve_count = excluded.approve_count,
  disapprove_count = excluded.disapprove_count,
  total_votes = excluded.total_votes;

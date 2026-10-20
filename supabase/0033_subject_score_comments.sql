-- Unique two-word subject-teacher comments for every mark from 1 to 100.
-- Idempotent: skips rows that already exist for the active config.

do $$
declare
  cfg uuid;
begin
  select id into cfg from public.comment_engine_configs where status = 'active' limit 1;
  if cfg is null then
    return;
  end if;

  insert into public.comment_templates (
    config_id, comment_type, template_group, band_code, template_text, exact_words, status, sort_order
  )
  select cfg, 'subject_teacher', v.template_group, v.band_code, v.template_text, 2, 'active', v.sort_order
  from (values
    (1, 'score_1', 'weak', 'Barely starting', 1),
    (2, 'score_2', 'weak', 'Severely struggling', 2),
    (3, 'score_3', 'weak', 'Minimal response', 3),
    (4, 'score_4', 'weak', 'Extremely weak', 4),
    (5, 'score_5', 'weak', 'Critically weak', 5),
    (6, 'score_6', 'weak', 'Hardly coping', 6),
    (7, 'score_7', 'weak', 'Almost absent', 7),
    (8, 'score_8', 'weak', 'Deeply struggling', 8),
    (9, 'score_9', 'weak', 'Far behind', 9),
    (10, 'score_10', 'weak', 'Lacks foundations', 10),
    (11, 'score_11', 'weak', 'Major gaps', 11),
    (12, 'score_12', 'weak', 'Serious difficulty', 12),
    (13, 'score_13', 'weak', 'Urgent support', 13),
    (14, 'score_14', 'weak', 'Intensive help', 14),
    (15, 'score_15', 'weak', 'Basic struggle', 15),
    (16, 'score_16', 'weak', 'Weak foundation', 16),
    (17, 'score_17', 'weak', 'Limited grasp', 17),
    (18, 'score_18', 'weak', 'Poor grasp', 18),
    (19, 'score_19', 'weak', 'Struggling heavily', 19),
    (20, 'score_20', 'weak', 'Needs remedial', 20),
    (21, 'score_21', 'weak', 'Continuous support', 21),
    (22, 'score_22', 'weak', 'Guided practice', 22),
    (23, 'score_23', 'weak', 'Close supervision', 23),
    (24, 'score_24', 'weak', 'Slow progress', 24),
    (25, 'score_25', 'weak', 'Weak attempt', 25),
    (26, 'score_26', 'weak', 'Incomplete grasp', 26),
    (27, 'score_27', 'weak', 'Uncertain work', 27),
    (28, 'score_28', 'weak', 'Fragile understanding', 28),
    (29, 'score_29', 'weak', 'Below expectation', 29),
    (30, 'score_30', 'weak', 'Weak performance', 30),
    (31, 'score_31', 'weak', 'Needs scaffolding', 31),
    (32, 'score_32', 'weak', 'Requires tutoring', 32),
    (33, 'score_33', 'weak', 'Difficult progress', 33),
    (34, 'score_34', 'weak', 'Limited success', 34),
    (35, 'score_35', 'weak', 'Struggling still', 35),
    (36, 'score_36', 'weak', 'Needs guidance', 36),
    (37, 'score_37', 'weak', 'Requires support', 37),
    (38, 'score_38', 'weak', 'Weak showing', 38),
    (39, 'score_39', 'weak', 'Poor showing', 39),
    (40, 'score_40', 'needs_improvement', 'Needs improvement', 40),
    (41, 'score_41', 'needs_improvement', 'Must improve', 41),
    (42, 'score_42', 'needs_improvement', 'Improving slowly', 42),
    (43, 'score_43', 'needs_improvement', 'Extra practice', 43),
    (44, 'score_44', 'needs_improvement', 'More effort', 44),
    (45, 'score_45', 'needs_improvement', 'Greater focus', 45),
    (46, 'score_46', 'needs_improvement', 'Stronger effort', 46),
    (47, 'score_47', 'needs_improvement', 'Rising slowly', 47),
    (48, 'score_48', 'needs_improvement', 'Developing slowly', 48),
    (49, 'score_49', 'needs_improvement', 'Work harder', 49),
    (50, 'score_50', 'fair', 'Fair attempt', 50),
    (51, 'score_51', 'fair', 'Fair progress', 51),
    (52, 'score_52', 'fair', 'Fair performance', 52),
    (53, 'score_53', 'fair', 'Adequate effort', 53),
    (54, 'score_54', 'fair', 'Modest progress', 54),
    (55, 'score_55', 'fair', 'Acceptable work', 55),
    (56, 'score_56', 'fair', 'Satisfactory start', 56),
    (57, 'score_57', 'fair', 'Fair understanding', 57),
    (58, 'score_58', 'fair', 'Reasonable attempt', 58),
    (59, 'score_59', 'fair', 'Steady attempt', 59),
    (60, 'score_60', 'good', 'Good progress', 60),
    (61, 'score_61', 'good', 'Good effort', 61),
    (62, 'score_62', 'good', 'Good attempt', 62),
    (63, 'score_63', 'good', 'Solid progress', 63),
    (64, 'score_64', 'good', 'Solid work', 64),
    (65, 'score_65', 'good', 'Capable work', 65),
    (66, 'score_66', 'good', 'Encouraging work', 66),
    (67, 'score_67', 'good', 'Promising work', 67),
    (68, 'score_68', 'good', 'Commendable effort', 68),
    (69, 'score_69', 'good', 'Good understanding', 69),
    (70, 'score_70', 'very_good', 'Very good', 70),
    (71, 'score_71', 'very_good', 'Strong work', 71),
    (72, 'score_72', 'very_good', 'Strong progress', 72),
    (73, 'score_73', 'very_good', 'Impressive effort', 73),
    (74, 'score_74', 'very_good', 'Fine work', 74),
    (75, 'score_75', 'very_good', 'Fine progress', 75),
    (76, 'score_76', 'very_good', 'Notable work', 76),
    (77, 'score_77', 'very_good', 'Notable progress', 77),
    (78, 'score_78', 'very_good', 'Consistent work', 78),
    (79, 'score_79', 'very_good', 'Consistent progress', 79),
    (80, 'score_80', 'excellent', 'Excellent work', 80),
    (81, 'score_81', 'excellent', 'Excellent progress', 81),
    (82, 'score_82', 'excellent', 'Excellent effort', 82),
    (83, 'score_83', 'excellent', 'Excellent grasp', 83),
    (84, 'score_84', 'excellent', 'Excellent standard', 84),
    (85, 'score_85', 'excellent', 'Outstanding work', 85),
    (86, 'score_86', 'excellent', 'Outstanding effort', 86),
    (87, 'score_87', 'excellent', 'Outstanding grasp', 87),
    (88, 'score_88', 'excellent', 'Superb work', 88),
    (89, 'score_89', 'excellent', 'Superb effort', 89),
    (90, 'score_90', 'excellent', 'Exceptional work', 90),
    (91, 'score_91', 'excellent', 'Exceptional effort', 91),
    (92, 'score_92', 'excellent', 'Remarkable work', 92),
    (93, 'score_93', 'excellent', 'Remarkable effort', 93),
    (94, 'score_94', 'excellent', 'Brilliant work', 94),
    (95, 'score_95', 'excellent', 'Brilliant effort', 95),
    (96, 'score_96', 'excellent', 'Exemplary work', 96),
    (97, 'score_97', 'excellent', 'Exemplary effort', 97),
    (98, 'score_98', 'excellent', 'Masterful work', 98),
    (99, 'score_99', 'excellent', 'Near perfect', 99),
    (100, 'score_100', 'excellent', 'Perfect score', 100)
  ) as v(score, template_group, band_code, template_text, sort_order)
  where not exists (
    select 1 from public.comment_templates existing
    where existing.config_id = cfg
      and existing.comment_type = 'subject_teacher'
      and existing.template_group = v.template_group
  );
end $$;

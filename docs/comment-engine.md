# Report card commenting engine

Deterministic comments for KJA report cards: subject (2 words), co-curricular (one sentence with the child’s first name), class teacher (3 sentences), headteacher (12 words).

## Setup

1. Run `supabase/0025_comment_engine.sql` on the database.
2. Run `supabase/0026_cocurricular_skills.sql` for co-curricular marks and term skills.
3. Open **Academics → Comments** to review the active template bank and rules.
4. On a draft report card, enter co-curricular activities with:
   - a **mark** (score / out of), like other subjects
   - **skills this term** (what was supposed to be acquired)
   - **skills acquired** (what the pupil demonstrated)
5. Use **Auto comments** on the class bar, or **Generate comments** on a single draft card.
6. Edit and save as usual, then approve and post.

Qualitative levels (`Excellent` / `Good` / `Fair` / `Needs support`) still work. When a mark is entered, the engine prefers the mark band and can fill the level from it.

## How co-curricular comments stay smart

The engine builds a performance profile from marks **and** skills, then picks the first matching rule:

| Priority | Situation | Comment style |
|----------|-----------|---------------|
| Incomplete | No activity assessed | Limited records |
| Skill highlight | Strong mark + acquired skills | Names activity and acquired skills |
| Skill progress | Steady mark + acquired skills | Growing in named skills |
| Highlight | Strong activity, no skill detail | Names the activity |
| Strong / support / mixed | Band only | Generic commitment sentence |
| Skill gap | Weak/fair mark + missing skills | Names skills still to practise |

Placeholders: `{first_name}`, `{activity_name}`, `{skills_acquired}`, `{skills_focus}`.

## First name rule

Co-curricular summaries must include `{first_name}`. The engine resolves:

1. `preferred_name` (first token), else
2. first given name from register order (`Surname Given Names`).

Generation fails validation if the rendered sentence does not contain that name.

## Word and sentence counts

| Comment | Constraint |
|---------|------------|
| Subject teacher | Exactly 2 words |
| Co-curricular | 8–12 words, exactly 1 sentence, first name required |
| Class teacher | Exactly 3 sentences |
| Headteacher | Exactly 12 words |

Counting trims whitespace, splits on spaces, and treats punctuation attached to words as part of the word. The server validator is authoritative.

Keep skill labels short (one or two words) so skill sentences stay inside 8–12 words.

## Rules priority (headteacher)

1. Incomplete evidence  
2. Weak academic and weak co-curricular  
3. Strong academic / weak co-curricular  
4. Weak academic / strong co-curricular  
5. Strong both (only when overall assessment is complete)  
6. Mixed  
7. Balanced  
8. Fallback  

Incomplete co-curricular data never matches “strong both”.

## Workflow

- Generation runs only on **draft** cards.
- Approved and published cards are not overwritten.
- Provenance is stored in `generated_report_comments` and `comment_audit_logs`.
- Historical cards keep their saved text when templates change.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Schema / missing table errors | Run `supabase/0025_comment_engine.sql` |
| Missing score / skills columns | Run `supabase/0026_cocurricular_skills.sql` |
| “No active comment configuration” | Ensure one `comment_engine_configs` row has `status = 'active'` |
| Co-curricular needs review | Fill activity + mark or level, or accept the incomplete template |
| Generic coco comment | Add term skills + acquired skills, then regenerate |
| Headteacher not “strong both” | Both academic and co-curricular evidence must be complete and strong |

## Tests

```bash
npm test
```

Pure engine tests live in `lib/comment-engine/comment-engine.test.ts`.

# Report card commenting engine

Deterministic comments for KJA report cards: subject (2 words), co-curricular (one sentence with the child’s first name), class teacher (3 sentences), headteacher (12 words). Nursery DSBA cards use a separate progress-code class-teacher engine (see below).

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

Each activity comment (and the overall co-curricular sentence) is **composed** for that child from:

1. the **mark** (tone rises from support → fair → good → very good → excellent)
2. the **activity name** (Music, Sports, …)
3. **skills acquired** this term (celebrated when the mark is solid)
4. **skills still to practise** (named gently when the mark needs support)

Several professional stems exist per band; the engine picks one deterministically and retries if another activity on the same report already used that sentence.

Template rules remain as a fallback when composition cannot fit the word window (for example very long skill labels):

| Priority | Situation | Comment style |
|----------|-----------|---------------|
| Incomplete | No activity assessed | Limited records |
| Skill highlight | Strong mark + acquired skills | Names activity and acquired skills |
| Skill progress | Steady mark + acquired skills | Growing in named skills |
| Highlight | Strong activity, no skill detail | Names the activity |
| Strong / support / mixed | Band only | Generic commitment sentence |
| Skill gap | Weak/fair mark + missing skills | Names skills still to practise |

Placeholders in fallback templates: `{first_name}`, `{activity_name}`, `{skills_acquired}`, `{skills_focus}`.

## First name rule

Co-curricular summaries must include `{first_name}`. The engine resolves:

1. `preferred_name` (first token), else
2. first given name from register order (`Surname Given Names`).

Generation fails validation if the rendered sentence does not contain that name.

## Word and sentence counts

| Comment | Constraint |
|---------|------------|
| Subject teacher | Exactly 2 words |
| Co-curricular | About 12–22 words, exactly 1 sentence, first name required |
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

## Nursery class-teacher comments (DSBA)

Nursery cards print only **Class teacher’s comment**. Generation reads frozen `report_skill_lines` (progress codes) plus `students.sex` for gendered wording — not subject marks or clubs.

1. Run `supabase/0083_nursery_comment_templates.sql` then `supabase/0084_nursery_comment_templates_v2.sql` (desk stems) after the main comment engine install.
2. Open **Academics → Comments → Nursery** to review nursery lines, tone rules, and a progress-code sample preview.
3. Prepare nursery reports so skill lines exist, then use **Generate comments** / class auto-comments on drafts.

### Progress-code tiers

| Tier | Codes | Use in the remark |
|------|-------|-------------------|
| Mastery | `M` | Outstanding features (named first) |
| Solid | `S` | Steady strength; backs outstanding when M is scarce |
| Growing | `P`, `I`, `+/-` | Progressing language |
| Developing | `D` | Soft next-step focus |
| Support | `NP`, `A` | Gentle practice focus |
| Skip | `NA`, `NT`, blank | Ignored for naming |

### Natural voice

- Placeholders: `{first_name}`, `{girl_boy}`, `{she_he}`, `{her_his}`, `{outstanding_skills}`, `{focus_skills}`, `{strong_domains}`, `{focus_domains}`.
- `sex` `F`/`M` → girl/boy and she/he/her/his; unknown sex → “child” and name-led sentences (no forced “their”).
- High-coded social/music skills (e.g. gets along with classmates, likes teachers, rhymes/songs) produce portrait lines such as “friendly girl” and “She enjoys Nursery rhymes and songs,” not chopped catalogue text.
- Trait-aware compose stems win over desk templates when those social/music signals are present.

### Nursery remark shape

| Part | Constraint |
|------|------------|
| Class teacher | Exactly **3 sentences**, nursery-fitting language, learner name required |
| Subject / co-curricular / head | Not generated for nursery |

Sentence plan: overview → outstanding features (named skills/domains or social/music portrait) → warm next step. Composition is primary; desk templates with roles `nursery_overview` / `nursery_strengths` / `nursery_next_step` and groups `nursery_*` are used when present.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Schema / missing table errors | Run `supabase/0025_comment_engine.sql` |
| Missing score / skills columns | Run `supabase/0026_cocurricular_skills.sql` |
| “No active comment configuration” | Ensure one `comment_engine_configs` row has `status = 'active'` |
| Co-curricular needs review | Fill activity + mark or level, or accept the incomplete template |
| Generic coco comment | Add activity mark + term skills + acquired skills, then regenerate |
| Headteacher not “strong both” | Both academic and co-curricular evidence must be complete and strong |
| Nursery comment thin / incomplete | Enter progress codes on the developmental marksheet, prepare the card, then regenerate |
| Empty Nursery tab on Comments | Run `supabase/0083_nursery_comment_templates.sql` then `0084_nursery_comment_templates_v2.sql` |
| Stiff “nursery skills” wording | Run `0084_nursery_comment_templates_v2.sql` and regenerate comments |
| Missing she/he or girl/boy | Ensure `students.sex` is set (`M`/`F`), then regenerate |

## Tests

```bash
npm test
```

Pure engine tests live in `lib/comment-engine/comment-engine.test.ts` and `lib/comment-engine/nursery-compose.test.ts`.

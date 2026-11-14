/* The activity library (M2). Data, not markup: edit names, labels and resources here.
   opens: 'sheet' = the timer sheet · 'writing' = Scritti · 'grammar' = Grammatica.
   skill: the Risorse "good for" value whose Using-now resources appear as choices on this activity.
   A resource with tutor:true switches the Finish sheet's quick buttons to 30 / 45 / 60. */
window.PC_ACTIVITIES = [
  { id: 'vocab', name: 'Vocabulary Practice', short: 'Vocabulary', it: 'Vocabolario', opens: 'sheet', skill: 'vocabolario',
    hint: 'Anki · Busuu reviews', action: 'Clear your vocabulary reviews',
    resources: [{ id: 'anki', name: 'Anki' }, { id: 'busuu-reviews', name: 'Busuu reviews' }] },
  { id: 'lessons', name: 'Structured Lessons', short: 'Lessons', it: 'Lezioni', opens: 'sheet', skill: null,
    hint: 'Busuu · any course', action: 'One lesson from your course',
    resources: [{ id: 'busuu', name: 'Busuu' }, { id: 'course', name: 'Other course' }] },
  { id: 'speaking', name: 'Speaking', short: 'Speaking', it: 'Parlare', opens: 'sheet', skill: 'parlare',
    hint: 'iTalki · LingoLooper · conversation', action: 'One conversation out loud',
    resources: [{ id: 'italki', name: 'iTalki lesson', tutor: true }, { id: 'lingolooper', name: 'LingoLooper' }, { id: 'conversation', name: 'Conversation' }] },
  { id: 'listening', name: 'Listening', short: 'Listening', it: 'Ascoltare', opens: 'sheet', skill: 'ascoltare',
    hint: 'Coffee Break Italian · podcasts · TV', action: 'One podcast episode or part of a show',
    resources: [{ id: 'coffee-break', name: 'Coffee Break Italian' }, { id: 'podcast', name: 'Other podcast' }, { id: 'tv', name: 'Film or TV' }] },
  { id: 'reading', name: 'Reading', short: 'Reading', it: 'Leggere', opens: 'sheet', skill: 'leggere',
    hint: 'Stories · graded readers', action: 'A passage from a story or a graded reader',
    resources: [{ id: 'stories', name: 'Stories' }, { id: 'graded-reader', name: 'Graded reader' }] },
  { id: 'workbook', name: 'Workbook Practice', short: 'Workbook', it: 'Eserciziario', opens: 'sheet', skill: null,
    hint: 'Any workbook', action: 'A page of workbook exercises',
    resources: [{ id: 'workbook', name: 'Workbook' }] },
  { id: 'writing', name: 'Writing', short: 'Writing', it: 'Scrivere', opens: 'writing', skill: 'scrivere',
    hint: 'Two sentences or 50–100 words', action: 'Write two sentences',
    resources: [{ id: 'prompts', name: 'In-app prompts' }] },
  { id: 'grammar', name: 'Grammar Memorisation', short: 'Grammar', it: 'Tabelle', opens: 'grammar', skill: 'grammatica',
    hint: 'Grammar tables, on paper', action: 'Pick a table and write it out from memory',
    resources: [{ id: 'tables', name: 'Grammar tables' }] }
];

/* Mistakes review (M8.4): counts as practice and shows in Progressi, but is not one of the 8 activities. */
window.PC_REVIEW = { id: 'review', name: 'Mistakes review', short: 'Mistakes review', it: 'Errori', opens: 'review', resources: [] };

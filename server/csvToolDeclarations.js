const COL_NOTE =
  'Use the exact column name as it appears in the [CSV columns: ...] header at the top of the message — copy it character-for-character, preserving spaces and capitalisation.';

const CSV_TOOL_DECLARATIONS = [
  {
    name: 'compute_column_stats',
    description:
      'Compute descriptive statistics (mean, median, std, min, max, count) for a numeric column. ' + COL_NOTE,
    parameters: {
      type: 'OBJECT',
      properties: {
        column: {
          type: 'STRING',
          description:
            'Exact column name copied from [CSV columns: ...]. Example: if the header says "Favorite Count" pass "Favorite Count", not "favorite_count".',
        },
      },
      required: ['column'],
    },
  },
  {
    name: 'get_value_counts',
    description:
      'Count occurrences of each unique value in a column (for categorical data). ' + COL_NOTE,
    parameters: {
      type: 'OBJECT',
      properties: {
        column: {
          type: 'STRING',
          description: 'Exact column name copied from [CSV columns: ...]. ' + COL_NOTE,
        },
        top_n: { type: 'NUMBER', description: 'How many top values to return (default 10)' },
      },
      required: ['column'],
    },
  },
  {
    name: 'get_top_tweets',
    description:
      'Return the top or bottom N tweets sorted by any metric, including the computed "engagement" column ' +
      '(Favorite Count / View Count). Returns tweet text + all key metrics in a readable format. ' +
      'Use this when someone asks for the best/worst/most/least performing tweets, ' +
      'e.g. "show me the 10 most engaging tweets" or "what are the least viewed tweets". ' +
      'The "engagement" column is always available once a CSV is loaded.',
    parameters: {
      type: 'OBJECT',
      properties: {
        sort_column: {
          type: 'STRING',
          description:
            'Metric to sort by. Use "engagement" for engagement ratio, or any exact column name from [CSV columns: ...].',
        },
        n: { type: 'NUMBER', description: 'Number of tweets to return (default 10).' },
        ascending: {
          type: 'BOOLEAN',
          description:
            'false = highest first (top performers), true = lowest first (worst performers). Default false.',
        },
      },
      required: ['sort_column'],
    },
  },
];

module.exports = { CSV_TOOL_DECLARATIONS };

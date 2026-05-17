import type { ContentType, FieldDefinition } from '@/types/xendingDesign';

/**
 * Field definitions for each content type.
 *
 * Each content type maps to a set of required fields that the user
 * must fill in when creating a piece of that type. The fields define
 * the data structure expected by the corresponding HTML templates.
 */
const CONTENT_TYPE_FIELDS: Record<ContentType, FieldDefinition[]> = {
  'breaking-news': [
    {
      key: 'headline',
      label: 'Headline',
      type: 'text',
      required: true,
      placeholder: 'e.g., Fed Holds Rates Steady at 5.25%',
    },
    {
      key: 'dataPoint',
      label: 'Data Point',
      type: 'text',
      required: true,
      placeholder: 'e.g., +0.25% rate increase',
    },
    {
      key: 'date',
      label: 'Date',
      type: 'date',
      required: true,
    },
    {
      key: 'source',
      label: 'Source',
      type: 'text',
      required: true,
      placeholder: 'e.g., Federal Reserve, Banxico',
    },
  ],

  'market-update': [
    {
      key: 'currencyPair',
      label: 'Currency Pair',
      type: 'text',
      required: true,
      placeholder: 'e.g., USD/MXN',
    },
    {
      key: 'rate',
      label: 'Rate',
      type: 'number',
      required: true,
      placeholder: 'e.g., 17.45',
    },
    {
      key: 'changePercent',
      label: 'Change %',
      type: 'number',
      required: true,
      placeholder: 'e.g., -0.32',
    },
    {
      key: 'date',
      label: 'Date',
      type: 'date',
      required: true,
    },
    {
      key: 'trendDirection',
      label: 'Trend Direction',
      type: 'select',
      required: true,
      options: ['up', 'down', 'stable'],
    },
  ],

  corporate: [
    {
      key: 'title',
      label: 'Title',
      type: 'text',
      required: true,
      placeholder: 'e.g., Q4 Results Summary',
    },
    {
      key: 'bodyText',
      label: 'Body Text',
      type: 'text',
      required: true,
      placeholder: 'Main content for the communication',
    },
    {
      key: 'contactInfo',
      label: 'Contact Info',
      type: 'text',
      required: true,
      placeholder: 'e.g., info@xendinglobal.com | +1 (555) 123-4567',
    },
    {
      key: 'partnerBadge',
      label: 'Partner Badge',
      type: 'select',
      required: true,
      options: ['monex-usa', 'ping-pong', 'none'],
    },
  ],

  'stat-of-the-day': [
    {
      key: 'bigNumber',
      label: 'Big Number',
      type: 'text',
      required: true,
      placeholder: 'e.g., $2.5M, 30+, 99.9%',
    },
    {
      key: 'contextLabel',
      label: 'Context Label',
      type: 'text',
      required: true,
      placeholder: 'e.g., processed this quarter',
    },
    {
      key: 'period',
      label: 'Period',
      type: 'text',
      required: true,
      placeholder: 'e.g., Q4 2024, Last 30 days',
    },
  ],

  'tip-educational': [
    {
      key: 'tipHeadline',
      label: 'Tip Headline',
      type: 'text',
      required: true,
      placeholder: 'e.g., Did you know?',
    },
    {
      key: 'explanation',
      label: 'Explanation',
      type: 'text',
      required: true,
      placeholder: 'Detailed explanation of the tip or concept',
    },
    {
      key: 'cta',
      label: 'CTA',
      type: 'text',
      required: true,
      placeholder: 'e.g., Learn more at xendinglobal.com',
    },
  ],

  'event-special': [
    {
      key: 'message',
      label: 'Message',
      type: 'text',
      required: true,
      placeholder: 'e.g., Happy Holidays from the Xending team!',
    },
    {
      key: 'date',
      label: 'Date',
      type: 'date',
      required: true,
    },
    {
      key: 'visualTheme',
      label: 'Visual Theme',
      type: 'select',
      required: true,
      options: ['holiday', 'industry-event', 'milestone', 'seasonal', 'custom'],
    },
  ],
};

/**
 * Returns the field definitions for a given content type.
 *
 * Each content type has a specific set of fields that define the data
 * required to populate its HTML template. Fields include metadata like
 * label, input type, and placeholder text for UI rendering.
 *
 * @param contentType - The content type to get fields for
 * @returns Array of FieldDefinition objects for the content type
 */
export function getContentTypeFields(contentType: ContentType): FieldDefinition[] {
  return CONTENT_TYPE_FIELDS[contentType];
}

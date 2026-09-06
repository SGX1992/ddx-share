/* Two audiences, one codebase.

   Which one is decided by hostname, so the same files can be published to both
   domains with nothing to configure and nothing to keep in sync. Anything that
   differs between them belongs in this table — reach for a hostname check
   anywhere else and the two will drift. */

export const VARIANTS = {
  attendee: {
    eyebrow: null,
    headlines: ['I AM GOING', 'SEE YOU AT', 'MEET ME AT'],
    chips: ['I am going', 'See you at', 'Meet me at'],
    title: 'I am going to DDX',
    slug: 'i-am-going',
  },
  speaker: {
    eyebrow: 'SPEAKER',
    headlines: ['I AM SPEAKING AT', 'SEE YOU AT', 'MEET ME AT'],
    chips: ['I am speaking at', 'See you at', 'Meet me at'],
    title: 'I am speaking at DDX',
    slug: 'speaker',
  },
};

/* `?variant=speaker` is there so the speaker build can be checked from the
   attendee domain, and from localhost, without a second deployment. */
export function variantName() {
  const asked = new URLSearchParams(location.search).get('variant');
  if (asked && VARIANTS[asked]) return asked;
  return /^speak\./i.test(location.hostname) ? 'speaker' : 'attendee';
}

export const variant = () => VARIANTS[variantName()];

const SITE_NAME = 'insuredbycam';
const BASE_URL = 'https://insuredbycam.com';
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-default.jpg`;

export function buildPageMeta({ title, description, ogImage, ogType = 'website', path = '' }) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} \u2014 Georgia Insurance Quotes`;
  const url = `${BASE_URL}${path}`;
  return { fullTitle, description, ogImage: ogImage || DEFAULT_OG_IMAGE, ogType, url };
}

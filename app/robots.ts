import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/board', '/projects', '/login', '/auth']
    },
    sitemap: 'https://stackt.paulmarchiset.me/sitemap.xml',
    host: 'https://stackt.paulmarchiset.me'
  };
}

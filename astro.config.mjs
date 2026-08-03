import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.nyc-affordability.com',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
});

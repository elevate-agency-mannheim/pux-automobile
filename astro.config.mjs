// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

import react from '@astrojs/react';

import mdx from '@astrojs/mdx';

import sitemap from '@astrojs/sitemap';

const RATGEBER_KATEGORIEN = ["autoaufbereitung", "fahrzeugankauf", "fahrzeugverkauf", "wissen"];

// https://astro.build/config
export default defineConfig({
  site: 'https://pux-automobile.de',

  adapter: vercel(),

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [
    react(),
    mdx(),
    sitemap({
      serialize(item) {
        const path = new URL(item.url).pathname.replace(/\/$/, "");
        const segments = path.split("/").filter(Boolean);

        if (path === "") {
          item.priority = 1;
          item.changefreq = "weekly";
        } else if (path === "/ratgeber") {
          item.priority = 0.9;
          item.changefreq = "weekly";
        } else if (segments[0] === "ratgeber" && segments[1] === "standorte" && segments.length === 3) {
          // /ratgeber/standorte/{stadt}
          item.priority = 0.7;
          item.changefreq = "monthly";
        } else if (segments[0] === "ratgeber" && segments.length === 2 && RATGEBER_KATEGORIEN.includes(segments[1])) {
          // /ratgeber/{kategorie} — category hub pages
          item.priority = 0.8;
          item.changefreq = "weekly";
        } else if (segments[0] === "ratgeber" && segments.length === 3) {
          // /ratgeber/{kategorie}/{artikel} — individual articles
          item.priority = 0.6;
          item.changefreq = "monthly";
        } else {
          // impressum, datenschutz, etc.
          item.priority = 0.3;
          item.changefreq = "yearly";
        }

        return item;
      },
    }),
  ]
});
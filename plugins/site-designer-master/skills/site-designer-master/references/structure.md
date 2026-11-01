# Structure and navigation

| Rule | Check |
| --- | --- |
| Top navigation has 3-7 items, labelled in the customer's words ("Menu", "Prices", "Book"), never the company's ("Solutions", "Offerings"). | count the nav links at 1440 |
| The primary action is a button in the header on every page and stays reachable on a phone (header or a sticky bar). | the build's header partial; screenshot at 375 |
| The current page is marked, visually and with `aria-current="page"`. | build.mjs does it from site.json |
| The phone menu is a real button with `aria-expanded`, closes on Escape and on a link tap. | the site kit's site.js |
| The footer carries contact (a tappable phone, email, address with a map link), hours for a local business, legal links and socials. | the critic's page review |
| Exactly one h1 per page, and headings never skip a level. | meter rules H1_COUNT and HEADING_SKIP |
| A real 404 page that offers the main pages and a way home, sent with status 404. | the kit's 404 page and serve.mjs |
| Breadcrumbs only when pages are three or more levels deep. | the sitemap |
| Readable, stable paths (`/prices/`, never `/page?id=3`); the language in the path on a multilingual site. | site.json |
| Every link reaches a built page or file. | build.mjs fails on a link that does not resolve |

## Site types and their usual pages

| Type | Pages |
| --- | --- |
| One-page | one page with anchored sections; still a 404 page |
| Brochure | home, about, services or menu, prices, contact; 4-8 pages |
| Shop | home, category, product, cart, about, contact, delivery and returns |
| Booking | home, services, booking, about, contact |
| Portfolio | home (work), project pages, about, contact |
| Content | home, article list, article, about, contact |
| Event | one page plus schedule, speakers, tickets, venue |
| SaaS | home, product or features, pricing, about, contact, legal |

Pages a type lists are a start, not a template: drop what the business does not have, add what it does.

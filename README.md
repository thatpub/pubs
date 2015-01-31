pubs
====

Track the publications obtained from http://www.e-publishing.af.mil.
----

I've converted the bulk of all Air Force policies and regulations to text in order to index them efficiently for fast, intuitive searching.  Currently this function is missing and when you want something done (at all), you do it yourself.

**Technology Utilized**
- Data store:
  - Elasticsearch Database: http://elasticsearch.org/
- Plaintext-to-useful-shit:
  - Poppler pdftotext - http://poppler.freedesktop.org/
  - Node.js (switch to io.js in progress) - http://nodejs.org
- Web server / reverse proxy for Elasticsearch interfacing
  - Debian 7.5 x64 (Linode)
  - nginx 1.7.2 - http://wiki.nginx.org/Main

Code is my own but the documents obviously are not (but are publically available and have no limitations on releaseability).

Suggestions/ideas are very welcome.  Much of what is here is half-baked thoughts and thrown together JS without real testing done.

Given the extremely specific use-case of this project, **don't** use this code expecting something useful.  I see no reason anyone will actually have a use for this other than myself.

It's essentially a ton of RegEx iteration through text turning into a structured JS object following the inherint hierachy in each document.  Not fool-proof.  Some writers do some things that break my attempts at parsing.  So far the only docs that are reliable (*using that word loosly*) when parsing are the Departmental AFIs (some supplements too, but most share a very different format).

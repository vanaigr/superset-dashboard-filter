# Superset Dashboard filters

This is an example program that shows how to set dashboard filters in [Superset](https://github.com/apache/superset) programmatically.
To run, execute `npm i` and then `npm exec vite-node index.ts`.

[/filters.ts](./filters.ts) contains all the logic, and [/index.ts](./index.ts) has an example program.

Feel free to copy anything from this repo for any purpose with or without attribution.

The program works by generating `native_filters`, storing them in a key-value store on the Superset server, and generating a url with the key of the stored filters. It's essentially the same as '...' > 'Share' > 'Copy permalink to clipboard'.

Currently all 5 filter types are supported: 'Value', 'Numerical range', 'Time range', 'Time column' and 'Time grain'.
Default values are respected.

Tested on Superset commit 93fa39a14ff312284ccf41699628e2fd4e9d9f5d (after version 4.1.2).

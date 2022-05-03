import { useStatic, useTemplate, useWhole } from "./.dot/.y/index.ts";;
import "https://deno.land/std@0.135.0/dotenv/load.ts";
import As404 from "./pages/Errors/404.jsx";
import AsIndex from "./pages/Index.jsx";

const pages = {
  "/": {
    GET: useTemplate({
      template: AsIndex(),
    }),
  },
  "/Index.css": {
    GET: useStatic,
  },
  "/img/logo.svg": {
    GET: useStatic,
  },
  "/img/maskable-logo.png": {
    GET: useStatic,
  },
  "/404": {
    GET: useTemplate({ template: As404(), path: "/404", status: 404 }),
  },
};

useWhole(pages, Deno.env.get("CNAME"));
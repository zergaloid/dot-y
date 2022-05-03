import { serveWithACME } from "./acme.ts";
import {
  DOMParser,
  Element,
  HTMLDocument,
} from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";
import { mime } from "https://raw.githubusercontent.com/Tyrenn/mimetypes/main/mod.ts";
import { render } from "https://cdn.skypack.dev/preact-render-to-string@v5.1.12";

const Template = render;

export type Reply = [Uint8Array, ResponseInit];
export type Object<T> = Record<string, T>;

// @ts-ignore: ignore circular
export type Binder = Record<
  string,
  | ((request: Request) => Reply)
  | Binder
>;

const Decoder = new TextDecoder();
const Encoder = new TextEncoder();

const useStatic = (request: Request) => {
  const key = new URL(request.url).pathname;
  const path = `../build${key}`;

  return [
    Deno.readFile(path),
    {
      headers: {
        "Content-Type": mime.getType(path),
      },
    },
  ];
};

const cache: Record<string, [string, ResponseInit]> = {};

const useTemplate = (
  { template, status = 200 }: {
    template: any;
    status?: number;
  },
) => {
  return (request: Request) => {
    const cacheKey = btoa(request.headers.get('ETag') as string + request.url);
    const cached = cache[cacheKey];

    if (cached) {
      return cached;
    }

    const html = Decoder.decode(Deno.readFileSync('../static/Index.html'))

    const r = [html.replace("TEMPLATE", template), {
      status,
      headers: {
        "Content-Type": "text/html;charset=utf-8",
        "Server": ".y",
      },
    } as ResponseInit];

    cache[cacheKey] = r as [string, ResponseInit];

    return r;
  };
};

const useWhole = (templatePathBinder: Binder, cname: string) => {
  serveWithACME(async (request: Request) => {
    let location = new URL(request.url);
    if (
      !templatePathBinder[location.pathname] ||
      !templatePathBinder[location.pathname][request.method]
    ) {
      location = {
        pathname: "/404",
      } as URL;
    }

    const reply = await templatePathBinder[location.pathname][request.method](
      request,
    );
    const awaitedReply = await reply[0];
    return new Response(
      awaitedReply instanceof Uint8Array
        ? awaitedReply
        : Encoder.encode(awaitedReply),
      reply[1],
    );
  }, cname);
};

const useGuard = (request: Record<string, string>, guard: Record<string, (value: string) => boolean>) => {
  for (const key of Object.keys(guard)) {
    if (!guard[key](request[key])) {
      return [
        `Guard: Invalid or Empty Header: ${key}`,
        {
          status: 400,
        },
      ];
    }
  }
  return false;
};

export { Decoder, Encoder, Template, useGuard, useStatic, useTemplate, useWhole };

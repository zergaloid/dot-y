import { serveWithACME } from "./acme.ts";
import { mime } from "https://raw.githubusercontent.com/Tyrenn/mimetypes/main/mod.ts";
import { render } from "https://cdn.skypack.dev/preact-render-to-string@v5.1.12";

const Template = render;
export type Object<T> = Record<string, T>;

// @ts-ignore: ignore circular
export type Binder = Record<
  string,
  | ((request: Request) => Response)
  | Binder
>;

const Decoder = new TextDecoder();
const Encoder = new TextEncoder();

const HTML = Decoder.decode(Deno.readFileSync(Deno.env.get("PROD") ? './static/Index.html' : '../static/Index.html'))

const cache: Record<string, Uint8Array> = {}

const useStatic = async (request: Request) => {
  const key = new URL(request.url).pathname;
  const path = Deno.env.get("PROD") ? `./${key}` : `../build${key}`;

  if (!cache[key])
    cache[key] = await Deno.readFile(path)

  return new Response(cache[key], {
    headers: {
      "Content-Type": mime.getType(path),
    } as HeadersInit,
  })
};

const useTemplate = ({ template, status = 200 }: {
  template: any;
  status?: number;
},
) => {
  return (request: Request) => {
    const etag = (request.headers.get('ETag') as string) + request.url

    if (!cache[etag])
    cache[etag] = Encoder.encode(HTML.replace("TEMPLATE", template))


    return new Response(cache[etag], {
      status,
      headers: {
        "Content-Type": "text/html;charset=utf-8",
        "Server": ".y",
      },
    })
  };
};

const useStreamedTemplate = (pages: Binder,
  { template, status = 200 }: {
    template: any;
    status?: number;
  },
) => {
  return (request: Request) => {
    const uuid = crypto.randomUUID()
    const stream: TransformStream = new TransformStream({
      start() { },
      async transform(chunk, controller) {
        chunk = await chunk
        controller.enqueue(`data: ${chunk}\n\n`)
      },
    })
    pages[`/stream/${uuid}`] = {
      GET: () => {
        return new Response(stream.readable.pipeThrough(new TextEncoderStream()), {
          headers: {
            "Content-Type": "text/event-stream",
          },
        });
      }
    }

    return new Response(HTML.replace("TEMPLATE", template({ uuid, realtime: stream.writable.getWriter() })), {
      status,
      headers: {
        "Content-Type": "text/html;charset=utf-8",
        "Server": ".y",
      },
    });
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
    return await templatePathBinder[location.pathname][request.method](
      request,
    );
  }, cname);
};

const useGuard = (request: Record<string, string>, guard: Record<string, (value: string) => boolean>) => {
  for (const key of Object.keys(guard)) {
    if (!guard[key](request[key])) {
      return [
        `Guard: ${key}`,
        {
          status: 400,
        },
      ];
    }
  }
  return false;
};

export { Decoder, Encoder, Template, useGuard, useStatic, useTemplate, useStreamedTemplate, useWhole };

import Container from "./Container.jsx";
export default function ({ children }) {
  return (
    <Container styling="shadow-lg border-2 transition ease-in-out delay-150 hover:bg-slate-300 duration-300">
      <nav class="flex items-center flex-col md:flex-row">
        <img
          src="/img/logo.svg"
          class="max-h-16 px-2 mx-2 cursor-pointer"
          onClick="window.location.assign('/')"
          alt="Logo"
        >
        </img>
        <div class="flex flex-col md:flex-row md:w-full md:justify-between">
          {children}
        </div>
      </nav>
    </Container>
  );
}

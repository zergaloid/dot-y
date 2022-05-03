import Container from "../Components/Container.jsx";
import Layout from "../Layout.jsx";
import { Template } from "../../.dot/.y/index.ts";

export default function () {
  return Template(
    <Layout>
      <Container>
        <p class="text-center">Found nothing, chief</p>
      </Container>
    </Layout>
  );
}
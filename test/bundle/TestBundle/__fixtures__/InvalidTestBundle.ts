// @ts-expect-error The bundlers must report this unresolved fixture import.
// oxlint-disable-next-line import/no-unassigned-import -- The unresolved side-effect import is the invalid bundle fixture.
import "package-that-does-not-exist";

export default 42;

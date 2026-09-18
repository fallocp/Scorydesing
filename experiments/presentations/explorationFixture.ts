import type { ExplorationRequest, IdeaContent } from '../../supabase/functions/_shared/desaing/explorationContracts';

/** Text fixtures for the injected planning transport. No prompt, pixel or design quality claim. */
export function explorationFixture(request: ExplorationRequest): { message: string; ideas: IdeaContent[] } {
  if (request.kind === 'discussion') return { message: 'Podemos conservar la paleta y dejar más aire alrededor del avión. Primero ajustemos la idea; la imagen sólo se crea cuando pulses Generar borrador.', ideas: [] };
  const names = ['Vuelo editorial', 'Órbita serena', 'Trayectoria gráfica', 'Horizonte suave', 'Viaje en papel'];
  const styles = ['Volumen editorial sobrio', 'Formas limpias y suaves', 'Geometría gráfica precisa', 'Acabado mate y delicado', 'Capas de papel ilustrado'];
  return { message: 'Aquí tienes cinco ideas de texto para la pieza de tu diapositiva. Puedes combinar sus aspectos antes de generar un borrador.',
    ideas: names.map((title, index) => ({ title, rationale: `La opción ${index + 1} propone una dirección distinta y conserva espacio para el texto editable.`,
      aspects: { subject: `Avión completo en tres cuartos, variante ${index + 1}`, composition: `Ascenso a la derecha con margen ${index + 1} y equilibrio dentro de la zona`,
        style: styles[index], palette: index % 2 ? 'Marfil, azul petróleo y coral suave' : 'Marfil, verde petróleo y un acento coral' },
      render_instruction: `Crea una pieza independiente de avión, dirección ${title}, ${styles[index].toLowerCase()}, ascenso a la derecha y fondo marfil. Conserva el texto editable y no reproduzcas toda la portada.`,
      reference_ids: request.context.references.map(reference => reference.reference_id),
    })) };
}

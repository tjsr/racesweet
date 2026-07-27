import { describe, expect, it } from 'vitest';
import { getOpenApiSpecification } from './openapi.js';
import { getSwaggerUiHtml, getSwaggerUiInit } from './replicaListenerServer.js';

describe('RaceSweet OpenAPI documentation', () => {
  it('documents the mutation replication resource and its request and response contracts', () => {
    const specification = getOpenApiSpecification();
    const mutationPath = specification.paths['/api/v1/mutations'];

    expect(specification.openapi).toBe('3.0.3');
    expect(specification.info.title).toBe('RaceSweet Replication API');
    expect(mutationPath?.get).toBeDefined();
    expect(mutationPath?.put).toBeDefined();
    expect(specification.components.schemas.MutationPushRequest).toBeDefined();
    expect(specification.components.schemas.MutationPullResponse).toBeDefined();
  });

  it('generates a base-page Swagger UI that loads the published OpenAPI document', () => {
    const html = getSwaggerUiHtml();

    expect(html).toContain('/swagger-ui/swagger-ui.css');
    expect(html).toContain('/swagger-ui/swagger-ui-bundle.js');
    expect(getSwaggerUiInit()).toContain("url: '/openapi.json'");
  });
});

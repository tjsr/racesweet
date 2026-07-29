import { describe, expect, it } from 'vitest';
import { getOpenApiSpecification } from './openapi.js';
import { getSwaggerUiHtml, getSwaggerUiInit } from './replicaListenerServer.js';

describe('RaceSweet OpenAPI documentation', () => {
  it('documents authentication, application events, uploads, and mutation replication', () => {
    const specification = getOpenApiSpecification();
    const mutationPath = specification.paths['/api/v1/mutations'];

    expect(specification.openapi).toBe('3.0.3');
    expect(specification.info.title).toBe('RaceSweet API');
    expect(specification.paths['/api/v1/auth/setup']?.post).toBeDefined();
    expect(specification.paths['/api/v1/bootstrap']?.get).toBeDefined();
    expect(specification.paths['/api/v1/events']?.get).toBeDefined();
    expect(specification.paths['/api/v1/uploads']?.post).toBeDefined();
    expect(mutationPath?.get).toBeDefined();
    expect(mutationPath?.put).toBeDefined();
    expect(specification.components.schemas.MutationPushRequest).toBeDefined();
    expect(specification.components.schemas.MutationPullResponse).toBeDefined();
  });

  it('generates Swagger UI for the API route and loads the published OpenAPI document', () => {
    const html = getSwaggerUiHtml();

    expect(html).toContain('/api/swagger-ui/swagger-ui.css');
    expect(html).toContain('/api/swagger-ui/swagger-ui-bundle.js');
    expect(getSwaggerUiInit()).toContain("url: '/api/openapi.json'");
  });
});

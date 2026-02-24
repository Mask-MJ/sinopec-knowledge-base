import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * 配置 Swagger 文档
 */
export function setupSwagger(app: INestApplication, appName: string): void {
  const options = new DocumentBuilder()
    .setTitle(`${appName} 接口文档`)
    .setDescription(`The ${appName} API Description`)
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      name: 'bearer',
      description: '基于 JWT token',
    })
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('doc', app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: `${appName} API Docs`,
  });
}

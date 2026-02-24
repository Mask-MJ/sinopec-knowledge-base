import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

import { PaginateDto } from '../dto/base.dto';

class PaginateResponse<TData> extends PaginateDto {
  list: TData[];
  total: number;
}

export const ApiPaginatedResponse = <TModel extends Type<any>>(
  model: TModel,
) => {
  return applyDecorators(
    ApiExtraModels(PaginateResponse, model),
    ApiOkResponse({
      schema: {
        title: `PaginatedResponseOf${model.name}`,
        allOf: [
          { $ref: getSchemaPath(PaginateResponse) },
          {
            properties: {
              currentPage: { type: 'number', default: 1 },
              totalCount: { type: 'number', default: 0 },
              pageCount: { type: 'number', default: 0 },
              list: {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
                default: [],
              },
            },
          },
        ],
      },
    }),
  );
};

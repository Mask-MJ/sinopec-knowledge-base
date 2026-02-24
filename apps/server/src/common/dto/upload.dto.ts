import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

/**
 * 上传文件类型枚举
 */
export enum FileType {
  AUDIOS = 'audios',
  IMAGES = 'images',
  VIDEOS = 'videos',
}

export class UploadDto {
  file: Express.Multer.File;
  fileName: string;
}

export class FilesUploadDto {
  /**
   * 上传的文件列表
   */
  @ApiProperty({ type: 'array', items: { type: 'string', format: 'binary' } })
  files: any[];

  /**
   * 文件类型
   * @example 'images'
   */
  @IsEnum(FileType)
  type: FileType;
}

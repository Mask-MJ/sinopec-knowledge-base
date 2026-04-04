import { Buffer } from 'node:buffer';

import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { MakeBucketOpt } from 'minio';

@Injectable()
export class MinioService {
  private readonly endPoint: string;
  private readonly logger = new Logger(MinioService.name);
  private readonly minioClient: Minio.Client;
  private readonly port: number;
  constructor(private configService: ConfigService) {
    this.endPoint = this.configService.get<string>('MINIO_ENDPOINT', '');
    this.port = this.configService.get<number>('MINIO_PORT', 9000);
    this.minioClient = new Minio.Client({
      endPoint: this.endPoint,
      port: this.port,
      useSSL: false,
      accessKey: this.configService.get<string>('MINIO_ACCESS_KEY'),
      secretKey: this.configService.get<string>('MINIO_SECRET_KEY'),
    });
  }

  async bucketExists(bucketName: string) {
    try {
      return await this.minioClient.bucketExists(bucketName);
    } catch (error) {
      this.logger.error(`检查存储桶是否存在失败: ${bucketName}`, error);
      throw new InternalServerErrorException('对象存储服务异常，请稍后重试');
    }
  }

  async createBucket(
    bucketName: string,
    region: string = 'us-east-1',
    makeOpts: MakeBucketOpt = {},
  ) {
    try {
      return await this.minioClient.makeBucket(bucketName, region, makeOpts);
    } catch (error) {
      this.logger.error(`创建存储桶失败: ${bucketName}`, error);
      throw new InternalServerErrorException('创建存储桶失败，请稍后重试');
    }
  }

  async getBucketPolicy(bucketName: string) {
    try {
      return await this.minioClient.getBucketPolicy(bucketName);
    } catch (error) {
      this.logger.error(`获取存储桶策略失败: ${bucketName}`, error);
      throw new InternalServerErrorException('获取存储桶策略失败');
    }
  }

  async getUrl(bucketName: string, objectName: string) {
    try {
      return await this.minioClient.presignedGetObject(bucketName, objectName);
    } catch (error) {
      this.logger.error(`获取文件 URL 失败: ${objectName}`, error);
      throw new InternalServerErrorException('获取文件链接失败');
    }
  }

  async listObjects(bucketName: string, prefix: string = '') {
    const objectsList: string[] = [];
    const stream = this.minioClient.listObjectsV2(bucketName, prefix, true);
    return new Promise<string[]>((resolve, reject) => {
      stream.on('data', (obj) => {
        if (obj.name) {
          objectsList.push(obj.name);
        }
      });
      stream.on('end', () => {
        resolve(objectsList);
      });
      stream.on('error', (err) => {
        this.logger.error(`列出对象失败: ${bucketName}/${prefix}`, err);
        reject(
          new InternalServerErrorException('列出文件失败，请稍后重试'),
        );
      });
    });
  }

  async setBucketPolicy(bucketName: string, policy: string) {
    try {
      return await this.minioClient.setBucketPolicy(bucketName, policy);
    } catch (error) {
      this.logger.error(`设置存储桶策略失败: ${bucketName}`, error);
      throw new InternalServerErrorException('设置存储桶策略失败');
    }
  }

  async uploadFile(bucketName: string, objectName: string, data: Buffer) {
    try {
      await this.minioClient.putObject(bucketName, objectName, data);
    } catch (error) {
      this.logger.error(`上传文件失败: ${objectName}`, error);
      throw new InternalServerErrorException('文件上传失败，请稍后重试');
    }
  }
}

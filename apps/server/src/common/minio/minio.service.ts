import { Buffer } from 'node:buffer';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { MakeBucketOpt } from 'minio';

@Injectable()
export class MinioService {
  private readonly endPoint: string;
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

  // 检查储存桶是否存在
  async bucketExists(bucketName: string) {
    return await this.minioClient.bucketExists(bucketName);
  }
  // 创建储存桶
  async createBucket(
    bucketName: string,
    region: string = 'us-east-1',
    makeOpts: MakeBucketOpt = {},
  ) {
    return await this.minioClient.makeBucket(bucketName, region, makeOpts);
  }
  // 查看储存桶策略
  async getBucketPolicy(bucketName: string) {
    return await this.minioClient.getBucketPolicy(bucketName);
  }
  // 获取文件的URL
  getUrl(bucketName: string, objectName: string) {
    return this.minioClient.presignedGetObject(bucketName, objectName);
  }
  // 获取桶中的文件列表
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
        reject(err);
      });
    });
  }
  // 设置储存桶策略
  async setBucketPolicy(bucketName: string, policy: string) {
    return await this.minioClient.setBucketPolicy(bucketName, policy);
  }
  // 上传文件
  async uploadFile(bucketName: string, objectName: string, data: Buffer) {
    await this.minioClient.putObject(bucketName, objectName, data);
  }
}

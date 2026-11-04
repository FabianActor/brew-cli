/**
 * 拼配成分
 */
export interface BlendComponent {
  percentage?: number; // 百分比 (1-100)
  origin?: string; // 产地（旧字段，当前填国家）
  country?: string; // 产国
  region?: string; // 产区
  estate?: string; // 庄园
  processingStation?: string; // 处理站
  altitude?: string; // 海拔
  process?: string; // 处理法
  batch?: string; // 批次
  variety?: string; // 品种
}

/**
 * 咖啡豆数据
 */
export interface CoffeeBean {
  // 核心标识
  id: string; // 唯一标识
  timestamp: number; // 时间戳
  name: string; // 咖啡豆名称

  // 基本信息
  roaster?: string; // 烘焙商名称
  image?: string; // 正面图片
  backImage?: string; // 背面图片
  capacity?: string; // 容量
  remaining?: string; // 剩余量
  price?: string; // 价格

  // 产品特性
  roastLevel?: string; // 烘焙度
  roastDate?: string; // 烘焙日期
  flavor?: string[]; // 风味描述
  notes?: string; // 备注

  // 时间管理
  startDay?: number; // 开始使用天数（数字）
  endDay?: number; // 结束使用天数（数字）
  isFrozen?: boolean; // 是否冷冻
  isInTransit?: boolean; // 是否在途

  // 分类标签
  beanType?: 'espresso' | 'filter' | 'omni'; // 豆子类型
  beanState?: 'green' | 'roasted'; // 豆子状态
  brand?: string; // 品牌

  // 生豆专用字段
  purchaseDate?: string; // 购买日期

  // 生豆来源追溯
  sourceGreenBeanId?: string; // 来源生豆 ID

  // 评分相关
  overallRating?: number; // 总体评分/喜好星值 (1-5)
  ratingNotes?: string; // 评价备注

  // 拼配成分
  blendComponents?: BlendComponent[];

  // 扩展字段（兼容历史/自定义字段）
  [key: string]: unknown;
}

/**
 * Supabase coffee_beans 表结构
 */
export interface SupabaseCoffeeBean {
  id: string;
  user_id: string;
  data: CoffeeBean;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  version: number;
}

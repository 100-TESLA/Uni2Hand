import { initializeStudentSchema, StudentIdentity } from './student-schema.services.js'
import type { University } from '../data/universities.js'
import { MongoClient, Db, Collection } from 'mongodb'
import 'dotenv/config'
import  User from '../models/users.schemas.js'
import Product from '../models/products.schemas.js'
import { RefreshToken } from '../models/users.schemas.js'
import { initializeOtpLifecycle, startOtpCleanup } from './otp-lifecycle.services.js'
const username = process.env.DB_USERNAME?.trim()
const password = process.env.DB_PASSWORD?.trim()
const dbName = process.env.DB_NAME?.trim()

const uri = process.env.MONGODB_URI ||`mongodb+srv://${username}:${password}@2hand.kgjhxgg.mongodb.net/?appName=2hand`

class DatabaseService {
  private client: MongoClient
  private db: Db
  private stopOtpCleanup?: () => void

  constructor() {
    this.client = new MongoClient(uri, { ignoreUndefined: true })
    // Sử dụng tên DB từ file .env
    this.db = this.client.db(dbName)
  }

  async connect() {
    try {
      await this.client.connect()
      await this.db.command({ ping: 1 })

      const userIndexes = await this.users.listIndexes().toArray()
      const indexNames = new Set(userIndexes.map((index) => index.name))

      if (!indexNames.has('email_1')) {
        await this.users.createIndex({ email: 1 }, { unique: true, sparse: true, name: 'email_1' })
      }

      console.log(`Pinged your deployment. You successfully connected to MongoDB!`)
      await this.indexUsers()
      await initializeStudentSchema(this.db)
      await initializeOtpLifecycle(this.users)
      this.stopOtpCleanup?.()
      this.stopOtpCleanup = startOtpCleanup(this.users)
    } catch (err) {
      console.error("Error in connecting to database: ", err)
      throw err
    }
  }

  async indexUsers() {
    try {
      const existsGoogleIndex = await this.users.indexExists(['google_id_1'])
      if (!existsGoogleIndex) {
        await this.users.createIndex(
          { google_id: 1 },
          {
            name: 'google_id_1',
            unique: true,
            partialFilterExpression: {
              google_id: { $type: 'string', $gt: '' }
            }
          }
        )
      }

    } catch (error) {
      console.error("Error creating user indexes:", error)
    }
  }
  async close() {
    this.stopOtpCleanup?.()
    await this.client.close()
  }
  get universities(): Collection<University> { return this.db.collection('universities') }
  get studentIdentities(): Collection<StudentIdentity> { return this.db.collection('student_identities') }
  get users(): Collection<User>{
    return this.db.collection('users')
  }
  get products(): Collection<Product>{
    return this.db.collection('products')
  }

  // Getter để lấy instance của database khi cần dùng 
  get database(): Db {
    return this.db
  }
  get refreshTokens(): Collection<RefreshToken> {
    return this.db.collection('refresh_tokens')
  }
  get emailVerificationLogs(): Collection<any> {
    return this.db.collection('email_verification_logs')
  }
  get addresses(): Collection<any> {
    return this.db.collection('addresses')
  }
  get address(): Collection<any> {
    return this.db.collection('address')
  }
  get orders(): Collection<any> {
    return this.db.collection('orders')
  }
  get categories(): Collection<any> {
    return this.db.collection('categories')
  }
  get subCategories(): Collection<any> {
    return this.db.collection('sub_categories')
  }
  get provinces(): Collection<any> {
    return this.db.collection('provinces')
  }
  get transactions(): Collection<any>{
    return this.db.collection('transactions')
  }
}

const databaseService = new DatabaseService()
export default databaseService
